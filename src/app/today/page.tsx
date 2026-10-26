import type { Metadata } from "next";
import Link from "next/link";
import FocusLink from "@/components/FocusLink";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";
import { previewSchedule, todayISO } from "@/lib/planService";
import { daysUntil } from "@/lib/dates";
import { Rocket, Coffee, MapPin } from "lucide-react";
import { getT } from "@/components/i18n/server";
import { dueLabel } from "@/components/i18n/messages";
import EmptyState from "@/components/EmptyState";
import BehindSheet from "@/components/BehindSheet";
import { recoverPlan, undoRecovery } from "./actions";
import { recoveryUndoAvailable } from "@/lib/planAdjustment";
import { assessRecovery } from "@/lib/recovery";
import SubmitButton from "@/components/SubmitButton";
import TodayBlockRow from "./TodayBlockRow";
import TodayCockpit from "./TodayCockpit";
import ExamStrip, { type ExamChip } from "./ExamStrip";
import { AnimatedList, AnimatedListItem } from "@/components/motion/AnimatedList";
import { parsePrefs, availableStudyMinutes, studyCapacityByWeekday } from "@/lib/timePlacer";
import { readStudyTask, readStudyResult, readStudyProgress } from "@/lib/studyTask";
import {
  assignLanes,
  canDeferReview,
  prioritizeBlocks,
  canMoveBlockToTomorrow,
  cockpitStatus,
  computeCapacity,
  minimumViableDay,
  pickHero,
  recoveryActionPreviews,
  riskVerdict,
  studyBudget,
  type CockpitBlock,
  type CockpitStatus,
  type Lane,
  type MinimumViableDay,
} from "./cockpit";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Today",
  description: "Your study blocks for today: what to work on, in order, and for how long.",
};

type Row = {
  id: string;
  topicTitle: string;
  minutes: number;
  completed: boolean;
  kind: string;
  actualMinutes: number | null;
  course: { name: string; id: string };
};

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{
    recovered?: string;
    moved?: string;
    min?: string;
    intense?: string;
    msg?: string;
    lightened?: string;
    blocks?: string;
  }>;
}) {
  const userId = await getCurrentUserId();
  const t = await getT();
  const today = todayISO();
  const overdue = await assessRecovery(userId, today);
  const start = new Date(today + "T00:00:00Z");
  const end = new Date(start.getTime() + 86400_000);

  // Post-recovery summary, carried via query params (clamped — they're URLs).
  const sp = await searchParams;
  const clampParam = (v: string | undefined, max: number) =>
    Math.min(max, Math.max(0, parseInt(v ?? "0", 10) || 0));
  const recovered = sp.recovered === "1";
  const recoveredMin = clampParam(sp.min, 100_000);
  const recoveredIntense = clampParam(sp.intense, 1000);
  const recoverFailed = sp.msg === "recover-failed";
  // "I'm behind" sheet outcomes (Protect today / Move optional work), carried back
  // as a calm confirmation. `blocks` = how many sessions were re-dated to tomorrow.
  const lightened = sp.lightened === "protect" || sp.lightened === "move" ? sp.lightened : null;
  const lightenedCount = clampParam(sp.blocks, 1000);
  const behindFailed = sp.msg === "behind-failed";
  // Rate-limited redirects (today/actions.ts → ?msg=rate-limited) get an honest,
  // calm banner instead of silently rendering nothing.
  const rateLimited = sp.msg === "rate-limited";

  // Load the proposal alongside the current plan. Previewing never writes rows.
  const [blocks, nextExam, upcomingExams, todaysLectures, upcomingDeadlines, prefUser, proposal] =
    await Promise.all([
    // Only the fields the BlockRow / header math actually read (the `Row` shape).
    prisma.studyBlock.findMany({
      where: { date: { gte: start, lt: end }, course: { userId } },
      select: {
        id: true,
        topicTitle: true,
        minutes: true,
        completed: true,
        kind: true,
        actualMinutes: true,
        topicId: true,
        studyResult: true,
        // course.examDate drives the per-course exam proximity used by the
        // explain-my-plan ordering reason and the catch-up urgency.
        course: { select: { name: true, id: true, examDate: true } },
      },
      // First-pass STUDY before its REVIEW within a day. "kind desc" puts
      // "study" before "review" (s > r), so you learn a topic before revising
      // it; the longest session leads each kind.
      orderBy: [{ kind: "desc" }, { minutes: "desc" }],
    }),
    // Nearest upcoming exam, for a motivating header line / focus banner.
    // Passed courses (bestanden, or a passing grade ≤ 4.0) are excluded: there
    // is no exam to prepare for, so counting down to it is just noise.
    prisma.course.findFirst({
      where: {
        userId,
        examDate: { gte: start },
        passed: false,
        OR: [{ grade: null }, { grade: { gt: 4 } }],
      },
      orderBy: { examDate: "asc" },
      select: { id: true, name: true, examDate: true },
    }),
    // All upcoming exams (soonest first) → the exam-countdown chip strip. Capped
    // so the strip can't grow unbounded for a user with many courses. Same
    // passed-course exclusion as the header exam above.
    prisma.course.findMany({
      where: {
        userId,
        examDate: { gte: start },
        passed: false,
        OR: [{ grade: null }, { grade: { gt: 4 } }],
      },
      orderBy: { examDate: "asc" },
      take: 12,
      select: { id: true, name: true, examDate: true },
    }),
    // Today's recurring classes (lectures/tutorials/labs).
    prisma.lecture.findMany({
      where: { userId, weekday: new Date(today + "T00:00:00Z").getUTCDay() },
      orderBy: { startMin: "asc" },
      select: { id: true, title: true, location: true, startMin: true, endMin: true },
    }),
    // Open deadlines due within the next 2 weeks, soonest first.
    prisma.assignment.findMany({
      where: {
        done: false,
        course: { userId },
        dueDate: { lt: new Date(start.getTime() + 14 * 86400_000) },
      },
      orderBy: { dueDate: "asc" },
      take: 6,
      select: {
        id: true,
        title: true,
        dueDate: true,
        course: { select: { name: true, id: true } },
      },
    }),
    // Study-window preferences (for today's capacity / risk line). Only the
    // preferences blob is read; parsePrefs tolerates null/legacy values.
    prisma.user.findUnique({ where: { id: userId }, select: { preferences: true, recoverySnapshot: true } }),
    previewSchedule(userId),
  ]);

  let nextDate = "";
  let nextBlocks: Row[] = [];
  if (blocks.length === 0) {
    const next = await prisma.studyBlock.findFirst({
      where: { date: { gte: end }, course: { userId } },
      orderBy: { date: "asc" },
      select: { date: true },
    });
    if (next) {
      nextDate = next.date.toISOString().slice(0, 10);
      const ns = new Date(nextDate + "T00:00:00Z");
      const ne = new Date(ns.getTime() + 86400_000);
      nextBlocks = await prisma.studyBlock.findMany({
        where: { date: { gte: ns, lt: ne }, course: { userId } },
        select: {
          id: true,
          topicTitle: true,
          minutes: true,
          completed: true,
          kind: true,
          actualMinutes: true,
          course: { select: { name: true, id: true } },
        },
        // STUDY before REVIEW within a day (see Today's main query above).
        orderBy: [{ kind: "desc" }, { minutes: "desc" }],
      });
    }
  }

  const totalMin = blocks.reduce((s, b) => s + b.minutes, 0);
  const doneMin = blocks.filter((b) => b.completed).reduce((s, b) => s + b.minutes, 0);
  const remainingMin = Math.max(0, totalMin - doneMin);
  const checkedGoals = new Set(blocks.filter((b) => readStudyResult(b.studyResult)?.outcome === "complete").map((b) => b.topicId));
  const practiceNeeded = new Set(blocks.filter((b) => readStudyResult(b.studyResult)?.outcome === "practice" && !checkedGoals.has(b.topicId)).map((b) => b.topicId));

  // Realistic focus time left today, for the cockpit's one-line risk verdict.
  // Capacity = the student's study WINDOW today (prefs day-start…day-end) minus
  // the minutes already spent in today's lectures, then discounted by a focus
  // factor (nobody studies every waking minute) and bounded by the time left
  // before a wind-down cutoff (Europe/Berlin). This is "how much can today really
  // hold" — the denominator for "am I over capacity / on track".
  const prefs = parsePrefs(prefUser?.preferences);
  const nowParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
  const [hh, mm] = nowParts.split(":").map(Number);
  const minutesNow = hh * 60 + mm;
  const FOCUS_RATIO = 0.75;
  // The window still open today: from now (or the window start) to the window end.
  const windowLeft = availableStudyMinutes({ startMin: Math.max(minutesNow, prefs.dayStartMin), endMin: prefs.dayEndMin }, todaysLectures);
  // Only lectures overlapping the remaining window consume time still available.
  const windowAvailableMin = Math.max(
    0,
    Math.floor(windowLeft * FOCUS_RATIO),
  );
  // Conservative ceiling: the smaller of the window math and the fixed daily study
  // budget. This is the realistic load today can hold — it stops the planner from
  // manufacturing a wall of "must-do" out of an optimistic 14h window.
  const completedTodayMin = blocks.filter((b) => b.completed).reduce((sum, b) => sum + b.minutes, 0);
  const availableMin = studyBudget(windowAvailableMin, Math.max(0, (prefs.dailyBudgetMin ?? 180) - completedTodayMin));

  // Each block's topic note, so the session sheet's quick-note editor opens
  // PRE-FILLED. It shares Note.body with the course-page editor — seeding it
  // empty made every sheet save an overwrite that destroyed the existing note.
  const noteRows = blocks.length
    ? await prisma.topic.findMany({
        where: {
          course: { userId },
          id: { in: [...new Set(blocks.map((b) => b.topicId))] },
        },
        select: { id: true, studyTask: true, studyProgress: true, confidence: true, order: true, note: { select: { body: true } } },
      })
    : [];
  const noteByTopic = new Map(noteRows.map((n) => [n.id, n.note?.body ?? null]));
  const taskByTopic = new Map(noteRows.map((n) => [n.id, readStudyTask(n.studyTask)]));

  // Cockpit math: capacity verdict + the four study-queue lanes + hero block.
  const cockpitBlocks: CockpitBlock[] = prioritizeBlocks(blocks.map((b) => ({
    examDays: daysUntil(b.course.examDate, today),
    confidence: noteRows.find((topic) => topic.id === b.topicId)?.confidence,
    topicOrder: noteRows.find((topic) => topic.id === b.topicId)?.order,
    ...b,
    note: noteByTopic.get(b.topicId) ?? null,
    task: taskByTopic.get(b.topicId) ?? null,
    progress: readStudyProgress(noteRows.find((topic) => topic.id === b.topicId)?.studyProgress),
  })));
  const cap = computeCapacity(remainingMin, availableMin);
  const risk = riskVerdict(cap);
  const laneMap = assignLanes(cockpitBlocks, cap);
  const lanes: Record<string, Lane> = Object.fromEntries(laneMap);
  const hero = pickHero(cockpitBlocks, laneMap);
  const unfinished = await prisma.topic.findMany({ where: { course: { userId }, done: false, studyProgress: { not: null } },
    take: 100, select: { id: true, title: true, studyProgress: true } });
  const latest = unfinished.map((topic) => ({ ...topic, progress: readStudyProgress(topic.studyProgress) }))
    .filter((topic) => topic.progress).sort((a, b) => b.progress!.updatedAt.localeCompare(a.progress!.updatedAt))[0];
  const resumeElsewhere = latest && !cockpitBlocks.some((block) => !block.completed && block.topicId === latest.id)
    ? await prisma.studyBlock.findFirst({ where: { topicId: latest.id, completed: false, kind: "study", course: { userId } }, orderBy: { date: "asc" }, select: { id: true } }) : null;

  // Due recall participates in today's load. Whole-plan feasibility remains
  // separate from completion of the sessions scheduled for this one day.
  const mustDoMin = remainingMin;
  // The scheduler includes allowed study days, lectures, overlapping courses,
  // overdue work and completed sessions. Today's time left cannot replace it.
  const examFeasibility = [...proposal.values()].some((course) => course.isOverloaded)
    ? { isOverloaded: true } : nextExam ? proposal.get(nextExam.id) : undefined;
  const status: CockpitStatus = cockpitStatus(mustDoMin, availableMin, examFeasibility);

  // Minimum Viable Day — the calm, decisive alternative to an anxiety list, shown
  // only when today needs a choice or can't fit. Selected from the student's REAL
  // open blocks (core study for the nearest exam + one retrieval + one optional),
  // never invented. The cockpit surfaces it as "the smallest day that still moves
  // you forward".
  const mvd: MinimumViableDay | null =
    status === "protected" ? null : minimumViableDay(cockpitBlocks, nextExam?.id ?? null);

  // Richer recovery preview: a before→after for each "Adjust today" option, computed
  // from real planner data WITHOUT committing. We split today's open load into
  // first-pass study vs reviews (the exact distinction the actions act on) and pass
  // the nearest exam's feasibility so each option can say, honestly, whether the
  // exam is still reachable afterwards.
  const openToday = blocks.filter((b) => !b.completed);
  const openStudyToday = openToday.filter((b) => b.kind !== "review");
  const openReviewToday = openToday.filter((b) => b.kind === "review");
  // Exam-eve clamp awareness: the real actions never move a block onto/past its
  // course's exam day, so the preview only counts blocks that can LEGALLY move
  // (block date + 1 day strictly before the exam — both UTC midnights; today's
  // blocks all sit on `start`). Anything pinned stays on today, and its minutes
  // feed the honest after-pace for "Move today's work".
  const isMovable = (b: (typeof blocks)[number]) =>
    canMoveBlockToTomorrow(start.getTime(), b.course.examDate.getTime());
  const rebuiltToday = [...proposal.values()].flatMap((p) => p.blocks)
    .filter((b) => b.date === today);
  const previews = recoveryActionPreviews({
    todayStudyMin: openStudyToday.reduce((s, b) => s + b.minutes, 0),
    todayReviewMin: openReviewToday.reduce((s, b) => s + b.minutes, 0),
    todayStudyCount: openStudyToday.length,
    todayReviewCount: openReviewToday.length,
    movableStudyCount: openStudyToday.filter(isMovable).length,
    allMovableReviewCount: openReviewToday.filter(isMovable).length,
    movableReviewCount: openReviewToday.filter((block) => isMovable(block) && canDeferReview(cockpitBlocks.find((item) => item.id === block.id)!)).length,
    movableReviewMin: openReviewToday.filter((block) => isMovable(block) && canDeferReview(cockpitBlocks.find((item) => item.id === block.id)!)).reduce((s, b) => s + b.minutes, 0),
    immovableMin: openToday
      .filter((b) => !isMovable(b))
      .reduce((s, b) => s + b.minutes, 0),
    rebuilt: {
      count: rebuiltToday.length,
      minutes: rebuiltToday.reduce((s, b) => s + b.minutes, 0),
    },
    exam: examFeasibility,
  });

  const horizonEnd = new Date(start.getTime() + 3 * 86400_000);
  const [horizon, weekLectures] = await Promise.all([
    prisma.studyBlock.findMany({ where: { date: { gte: start, lt: horizonEnd }, course: { userId } }, select: { date: true, minutes: true, completed: true, kind: true, topicId: true, course: { select: { examDate: true } } } }),
    prisma.lecture.findMany({ where: { userId }, select: { weekday: true, startMin: true, endMin: true } }),
  ]);
  const capacities = studyCapacityByWeekday(prefs, weekLectures);
  for (const kind of ["protect", "move", "lighter"] as const) {
    previews[kind].days = Array.from({ length: 3 }, (_, index) => {
      const date = new Date(start.getTime() + index * 86400_000).toISOString().slice(0, 10);
      const load = kind === "lighter" ? [...proposal.values()].flatMap((course) => course.blocks).filter((block) => block.date === date).reduce((sum, block) => sum + block.minutes, 0)
        : horizon.filter((block) => !block.completed).reduce((sum, block) => {
          const original = block.date.toISOString().slice(0, 10);
          const defer = original === today && canMoveBlockToTomorrow(block.date.getTime(), block.course.examDate.getTime())
            && (kind === "move" || canDeferReview({ kind: block.kind, confidence: noteRows.find((topic) => topic.id === block.topicId)?.confidence, examDays: daysUntil(block.course.examDate, today) }));
          const target = defer ? new Date(block.date.getTime() + 86400_000).toISOString().slice(0, 10) : original;
          return sum + (target === date ? block.minutes : 0);
        }, 0);
      const finished = horizon.filter((block) => block.completed && block.date.toISOString().slice(0, 10) === date).reduce((sum, block) => sum + block.minutes, 0);
      return { date, minutes: load, capacity: index === 0 ? availableMin : Math.max(0, capacities[new Date(date + "T00:00:00Z").getUTCDay()] - finished) };
    });
  }

  // Exam-countdown chips (soonest first), colored by urgency in the strip.
  const examChips: ExamChip[] = upcomingExams
    .map((c) => ({ id: c.id, name: c.name, days: daysUntil(c.examDate, today) }))
    .filter((c) => Number.isFinite(c.days) && c.days >= 0);

  // No plan exists at all (no sessions today, none scheduled ahead, no upcoming
  // exam) → treat as a brand-new user and onboard them, rather than implying a
  // "rest day" they never set up.
  const hasNoPlan =
    blocks.length === 0 &&
    nextBlocks.length === 0 &&
    !nextExam &&
    todaysLectures.length === 0 &&
    upcomingDeadlines.length === 0;

  return (
    // Pull-to-refresh now lives in the root layout (wraps every route once), so
    // this page must NOT wrap it again — that would double the touch listeners.
    <>
    {/* First-run intro for brand-new users with no plan yet. It self-gates on a
        localStorage "seen" flag, so it shows at most once and never for users
        who already have courses. */}

    {/* Container: a narrow calm column on mobile/tablet; on lg+ it widens so the
        single spine can breathe as a calm TWO-PANE — the cockpit spine on the
        left, today's context on the right. The grid below only kicks in at lg. */}
    <main className="mx-auto max-w-2xl p-4 sm:p-8 lg:max-w-5xl">
      {/* Header row: page title left, exam-countdown chips right — aligned on one
          baseline. Chips stack under the title on mobile (full-width scroll strip),
          and sit to the right of the title, bounded, on desktop. */}
      <div className="mb-4 lg:flex lg:items-start lg:justify-between lg:gap-6">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{t("today.title")}</h1>
        <div className="mt-3 min-w-0 lg:mt-1 lg:max-w-[24rem]">
          <ExamStrip exams={examChips} t={t} />
        </div>
      </div>

      {/* Recovery engine: after a recovery run, an honest summary of what was
          rebuilt. The proactive trigger now lives in the single "Adjust today"
          entry (BehindSheet) — no separate amber banner. Completed work survives. */}
      {recovered && (
        <div
          aria-live="polite"
          className="mb-4 rounded-xl border border-green-300 bg-green-50 p-4 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300"
        >
          <p className="font-semibold">{t("today.recoveredTitle")}</p>
          <p className="mt-1">
            {t("today.recoveredBody", { time: fmtDuration(recoveredMin) })}
            {recoveredIntense > 0 && (
              <> {t.n("today.recoveredIntense", recoveredIntense)}</>
            )}
          </p>
        </div>
      )}
      {recoverFailed && (
        <div aria-live="polite"
          className="mb-4 rounded-xl bg-surface-muted p-4 text-sm text-surface-foreground">
          {t("today.recoverFailed")}
        </div>
      )}
      {/* "I'm behind" confirmation: a calm, quiet acknowledgement (not a warning). */}
      {lightened && (
        <div
          aria-live="polite"
          className="mb-4 rounded-xl bg-surface-muted p-4 text-sm text-surface-foreground"
        >
          {lightened === "protect"
            ? t.n("behind.protectDone", lightenedCount, { count: lightenedCount })
            : t.n("behind.moveDone", lightenedCount, { count: lightenedCount })}
        </div>
      )}
      {behindFailed && (
        <div aria-live="polite"
          className="mb-4 rounded-xl bg-surface-muted p-4 text-sm text-surface-foreground">
          {t("behind.failed")}
        </div>
      )}
      {/* Rate-limited: a calm nudge, not an error — nothing changed. */}
      {rateLimited && (
        <div
          aria-live="polite"
          className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
        >
          {t("today.rateLimited")}
        </div>
      )}
      {(overdue.overdueSessions > 0 || (blocks.length === 0 && examFeasibility?.isOverloaded)) && <section className="mb-5 rounded-xl border border-border p-4" aria-label={t("today.planHealth")}>
        <p className="font-medium">{examFeasibility?.isOverloaded ? t("today.statusDoesntFit") : t("today.overdue", { count: overdue.overdueSessions, time: fmtDuration(overdue.overdueMinutes) })}</p>
        {examFeasibility?.isOverloaded && overdue.overdueSessions > 0 && <p className="mt-1 text-sm">{t("today.overdue", { count: overdue.overdueSessions, time: fmtDuration(overdue.overdueMinutes) })}</p>}
        <form action={recoverPlan} className="mt-3"><SubmitButton variant="secondary" pendingLabel={t("behind.working")}>{t("behind.recommendedAction")}</SubmitButton></form>
        {blocks.length === 0 && <BehindSheet preview={previews} trigger={(open) => <button type="button" onClick={open} className="mt-2 min-h-11 text-sm underline">{t("behind.otherOptions")}</button>} />}
      </section>}
      {recoveryUndoAvailable(prefUser?.recoverySnapshot) && <form action={undoRecovery} className="mb-4 flex flex-wrap items-center gap-3 text-sm"><span>{t("behind.undoHint")}</span><SubmitButton variant="secondary" pendingLabel={t("behind.working")}>{t("behind.undo")}</SubmitButton></form>}
      {sp.msg === "undo-unavailable" && <p role="status" className="mb-4 text-sm">{t("behind.undoUnavailable")}</p>}
      {sp.msg === "undo-done" && <p role="status" className="mb-4 text-sm">{t("behind.undoDone")}</p>}
      {resumeElsewhere && latest && <FocusLink blockId={resumeElsewhere.id} className="mb-4 flex min-h-11 items-center justify-center rounded-xl bg-brand px-4 py-3 text-center font-semibold text-brand-foreground">{t("flow.resumeTopic", { topic: latest.title })}</FocusLink>}
      <div className={todaysLectures.length > 0 || upcomingDeadlines.length > 0 ? "lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-12 xl:gap-16" : ""}>
      {blocks.length > 0 ? (
          <div className="min-w-0">
            {(checkedGoals.size > 0 || practiceNeeded.size > 0) && <p className="mb-4 rounded-xl bg-surface-muted p-3 text-sm" role="status">
              {t("study.progressSummary", { goals: checkedGoals.size, practice: practiceNeeded.size })}
            </p>}
            <TodayCockpit
              blocks={cockpitBlocks}
              lanes={lanes}
              hero={hero}
              risk={risk}
              status={status}
              mvd={mvd}
              previews={previews}
            />
          </div>

      ) : hasNoPlan ? (
        <EmptyState
          icon={<Rocket className="h-7 w-7" />}
          title={t("today.emptyNoPlanTitle")}
          description={t("today.emptyNoPlanDesc")}
          actions={[
            { label: t("start.title"), href: "/start" },
            { label: t("today.browseModules"), href: "/catalog", variant: "secondary" },
            { label: t("today.importSyllabus"), href: "/courses/import" },
            { label: t("today.addCourse"), href: "/courses/new" },
          ]}
        />
      ) : (
        <div>
          <EmptyState
            icon={<Coffee className="h-7 w-7" />}
            title={t("today.emptyRestTitle")}
            description={t("today.emptyRestDesc")}
            actions={[
              { label: t("today.myCourses"), href: "/courses" },
              { label: t("today.insights"), href: "/insights", variant: "secondary" },
            ]}
          />
          {nextBlocks.length > 0 && (
            <details className="mt-6 rounded-xl border border-gray-200 dark:border-gray-800">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <span>{t("today.nextUp")} · {nextDate}</span>
                <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-normal text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                  {nextBlocks.length}
                </span>
              </summary>
              <AnimatedList className="space-y-2 px-3 pb-3">
                {nextBlocks.map((b) => (
                  <AnimatedListItem key={b.id}>
                    <TodayBlockRow b={b} />
                  </AnimatedListItem>
                ))}
              </AnimatedList>
            </details>
          )}
        </div>
      )}
          <aside className="mt-6 lg:mt-0">
          {/* When there's no context at all, the right pane would be empty on
              lg+ — show a single calm line there instead of a hollow column.
              Hidden on mobile (nothing to fill, so the column just collapses). */}
          {examChips.length === 0 &&
            todaysLectures.length === 0 &&
            upcomingDeadlines.length === 0 && (
              <p className="hidden text-sm text-muted-foreground lg:block">
                {t("today.contextEmpty")}
              </p>
            )}

          {/* Demoted secondary context: today's classes + upcoming deadlines. */}
          {todaysLectures.length > 0 && (
            <section className="mt-6 first:mt-0">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {t("today.classes")}
              </h2>
              <ul className="space-y-2">
                {todaysLectures.map((l) => (
                  <li
                    key={l.id}
                    className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900"
                  >
                    <span className="shrink-0 whitespace-nowrap text-sm font-medium tabular-nums text-gray-600 dark:text-gray-300">
                      {fmtClock(l.startMin)}–{fmtClock(l.endMin)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{l.title}</span>
                      {l.location && (
                        <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                          <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                          {l.location}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {upcomingDeadlines.length > 0 && (
            <section className="mt-6 first:mt-0">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {t("today.deadlines")}
              </h2>
              <ul className="space-y-2">
                {upcomingDeadlines.map((a) => {
                  const days = daysUntil(a.dueDate, today);
                  const urgent = days <= 3;
                  return (
                    <li key={a.id}>
                      <Link
                        href={`/courses/${a.course.id}`}
                        className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-3 transition-colors hover:border-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-600"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{a.title}</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">{a.course.name}</span>
                        </span>
                        <span
                          className={`shrink-0 whitespace-nowrap text-xs font-medium ${
                            urgent ? "text-amber-700 dark:text-amber-400" : "text-gray-500 dark:text-gray-400"
                          }`}
                        >
                          {dueLabel(t, days)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          </aside>
      </div>
    </main>
    </>
  );
}

/** Minutes from midnight -> "10:00". */
function fmtClock(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/** "1h 20m" / "45m" / "0m" */
function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

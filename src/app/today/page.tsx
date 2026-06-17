import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";
import { todayISO } from "@/lib/planService";
import { daysUntil } from "@/lib/dates";
import { getStatsCached } from "@/lib/statsCache";
import { getT } from "@/components/i18n/server";
import { dueLabel } from "@/components/i18n/messages";
import EmptyState from "@/components/EmptyState";
import Onboarding from "@/components/Onboarding";
import { StreakBadge } from "@/components/StreakBadge";
import SubmitButton from "@/components/SubmitButton";
import TodayBlockRow from "./TodayBlockRow";
import TodayCockpit from "./TodayCockpit";
import ExamStrip, { type ExamChip } from "./ExamStrip";
import { recoverPlan } from "./actions";
import { assessRecovery, needsRecovery } from "@/lib/recovery";
import { AnimatedList, AnimatedListItem } from "@/components/motion/AnimatedList";
import { parsePrefs } from "@/lib/timePlacer";
import {
  assignLanes,
  computeCapacity,
  pickHero,
  riskVerdict,
  type CockpitBlock,
  type Lane,
} from "./cockpit";
import {
  explainPlan,
  type PlanExplanation,
  type ExplainCourse,
} from "@/lib/planExplain";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Today",
  description: "Your study blocks for today — what to work on, in order, and for how long.",
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
  searchParams: Promise<{ recovered?: string; moved?: string; min?: string; intense?: string; msg?: string }>;
}) {
  const userId = await getCurrentUserId();
  const t = await getT();
  const today = todayISO();
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

  // These four reads are independent, so fire them concurrently in a single
  // round-trip batch instead of awaiting one after another (avoids a serial
  // query waterfall). Identical results — only the wall-clock timing changes.
  const [blocks, nextExam, upcomingExams, todaysLectures, upcomingDeadlines, stats, recovery, prefUser] =
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
        // topicId (to look up the topic's self-rated confidence — the skim/skip
        // signal) + examDate (crunch-triage urgency). Both read only by triage.
        topicId: true,
        course: { select: { name: true, id: true, examDate: true } },
      },
      // First-pass STUDY before its REVIEW within a day. "kind desc" puts
      // "study" before "review" (s > r), so you learn a topic before revising
      // it; the longest session leads each kind.
      orderBy: [{ kind: "desc" }, { minutes: "desc" }],
    }),
    // Nearest upcoming exam, for a motivating header line / focus banner.
    prisma.course.findFirst({
      where: { userId, examDate: { gte: start } },
      orderBy: { examDate: "asc" },
      select: { id: true, name: true, examDate: true },
    }),
    // All upcoming exams (soonest first) → the exam-countdown chip strip. Capped
    // so the strip can't grow unbounded for a user with many courses.
    prisma.course.findMany({
      where: { userId, examDate: { gte: start } },
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
    // Cached analytics bundle — reused here only for the streak counter in the
    // header (cheap: shared with /insights + /api/stats, 30s TTL + write-invalidated).
    getStatsCached(userId, today),
    // Overdue unfinished sessions from missed days — drives the proactive
    // "rebuild my plan" recovery banner.
    assessRecovery(userId, today),
    // Study-window preferences (for today's capacity / risk line). Only the
    // preferences blob is read; parsePrefs tolerates null/legacy values.
    prisma.user.findUnique({ where: { id: userId }, select: { preferences: true } }),
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

  // Realistic focus time left today, for the cockpit's one-line risk verdict.
  // Capacity = the student's study WINDOW today (prefs day-start…day-end) minus
  // the minutes already spent in today's lectures, then discounted by a focus
  // factor (nobody studies every waking minute) and bounded by the time left
  // before a wind-down cutoff (Europe/Berlin). This is "how much can today really
  // hold" — the denominator for "am I over capacity / on track".
  const prefs = parsePrefs(prefUser?.preferences);
  const todaysLectureMin = todaysLectures.reduce(
    (s, l) => s + Math.max(0, l.endMin - l.startMin),
    0,
  );
  const nowParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
  const [hh, mm] = nowParts.split(":").map(Number);
  const minutesNow = hh * 60 + mm;
  const FOCUS_RATIO = 0.6; // ~60% of window hours is realistically focused study
  // The window still open today: from now (or the window start) to the window end.
  const windowLeft = Math.max(0, prefs.dayEndMin - Math.max(minutesNow, prefs.dayStartMin));
  // Subtract lectures that fall in the remaining window before discounting; clamp
  // at 0 so a heavy class day never yields negative capacity.
  const availableMin = Math.max(
    0,
    Math.round((windowLeft - todaysLectureMin) * FOCUS_RATIO),
  );

  // Cockpit math: capacity verdict + the four study-queue lanes + hero block.
  const cockpitBlocks: CockpitBlock[] = blocks;
  const cap = computeCapacity(remainingMin, availableMin);
  const risk = riskVerdict(cap);
  const laneMap = assignLanes(cockpitBlocks, cap);
  const lanes: Record<string, Lane> = Object.fromEntries(laneMap);
  const hero = pickHero(cockpitBlocks, laneMap);

  // ── Explain-my-plan: truthful reasons from the SAME deterministic signals ──
  // Per-course remaining minutes today + days to exam → the ordering reason; the
  // capacity picture → the "why this much today" reason. No fabrication.
  const remainingByCourse = new Map<string, { name: string; examDate: Date; remainingMin: number }>();
  for (const b of blocks) {
    if (b.completed) continue;
    const cur = remainingByCourse.get(b.course.id);
    if (cur) cur.remainingMin += b.minutes;
    else
      remainingByCourse.set(b.course.id, {
        name: b.course.name,
        examDate: b.course.examDate,
        remainingMin: b.minutes,
      });
  }
  const explainCourses: ExplainCourse[] = [...remainingByCourse.entries()].map(([id, c]) => ({
    id,
    name: c.name,
    examDays: daysUntil(c.examDate, today),
    remainingMin: c.remainingMin,
  }));
  const explain: PlanExplanation = explainPlan(
    {
      remainingMin: cap.remainingMin,
      availableMin: cap.availableMin,
      overMin: cap.overMin,
      freeMin: cap.freeMin,
      onTrack: cap.onTrack,
    },
    explainCourses,
  );

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
    <Onboarding active={hasNoPlan} />
    <main className="mx-auto max-w-2xl p-4 sm:p-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{t("today.title")}</h1>
        <StreakBadge streak={stats.currentStreak} t={t} />
      </div>

      {/* Exam-countdown strip — a single quiet line of countdowns at the very top
          ("OS 4d · Algorithms 24d"). The only urgency signal on the page. */}
      <ExamStrip exams={examChips} t={t} />

      {/* Recovery engine: after a recovery run, an honest summary of what was
          rebuilt; otherwise, when missed days have piled up overdue work, a
          proactive one-tap rebuild. Completed sessions always survive. */}
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
        <div className="mb-4 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {t("today.recoverFailed")}
        </div>
      )}
      {!recovered && needsRecovery(recovery) && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          <p className="font-semibold">{t("today.recoveryTitle")}</p>
          <p className="mt-1">
            {t("today.recoveryBody", {
              sessions: recovery.overdueSessions,
              time: fmtDuration(recovery.overdueMinutes),
            })}
          </p>
          <form action={recoverPlan} className="mt-3">
            <SubmitButton variant="primary" pendingLabel={t("today.recoveryPending")}>
              {t("today.recoveryCta")}
            </SubmitButton>
          </form>
        </div>
      )}

      {blocks.length > 0 ? (
        <>
          {/* The calm spine: hero next action + one honest status line + a quiet
              list of the rest of today, with the per-block session sheet and the
              single "Help me catch up" drawer holding everything demoted. */}
          <TodayCockpit
            blocks={cockpitBlocks}
            lanes={lanes}
            hero={hero}
            cap={cap}
            risk={risk}
            explain={explain}
          />

          {/* Demoted secondary context: today's classes + upcoming deadlines. */}
          {todaysLectures.length > 0 && (
            <section className="mt-6">
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
                        <span className="text-xs text-gray-500 dark:text-gray-400">📍 {l.location}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {upcomingDeadlines.length > 0 && (
            <section className="mt-6">
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
                            urgent ? "text-red-600 dark:text-red-400" : "text-gray-500 dark:text-gray-400"
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
        </>
      ) : hasNoPlan ? (
        <EmptyState
          emoji="🚀"
          title={t("today.emptyNoPlanTitle")}
          description={t("today.emptyNoPlanDesc")}
          actions={[
            { label: t("today.browseModules"), href: "/catalog" },
            { label: t("today.importSyllabus"), href: "/courses/import" },
            { label: t("today.addCourse"), href: "/courses/new" },
          ]}
        />
      ) : (
        <div>
          <EmptyState
            emoji="😎"
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

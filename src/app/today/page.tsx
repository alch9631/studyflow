import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";
import { todayISO } from "@/lib/planService";
import { daysUntil } from "@/lib/dates";
import { getStatsCached } from "@/lib/statsCache";
import { getT } from "@/components/i18n/server";
import { examCountdownLabel, dueLabel } from "@/components/i18n/messages";
import PomodoroTimer from "@/components/PomodoroTimer";
import EmptyState from "@/components/EmptyState";
import Onboarding from "@/components/Onboarding";
import { StreakBadge } from "@/components/StreakBadge";
import PullToRefresh from "@/components/PullToRefresh";
import SubmitButton from "@/components/SubmitButton";
import TodayBlockRow from "./TodayBlockRow";
import { recoverPlan } from "./actions";
import { assessRecovery, needsRecovery } from "@/lib/recovery";
import { AnimatedList, AnimatedListItem } from "@/components/motion/AnimatedList";

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
  const [blocks, nextExam, todaysLectures, upcomingDeadlines, stats, recovery] = await Promise.all([
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
        course: { select: { name: true, id: true } },
      },
      orderBy: [{ kind: "asc" }, { minutes: "desc" }],
    }),
    // Nearest upcoming exam, for a motivating header line / focus banner.
    prisma.course.findFirst({
      where: { userId, examDate: { gte: start } },
      orderBy: { examDate: "asc" },
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
        orderBy: [{ kind: "asc" }, { minutes: "desc" }],
      });
    }
  }

  const nextExamDays = nextExam ? daysUntil(nextExam.examDate, today) : null;
  const examWeek = nextExamDays !== null && nextExamDays <= 7; // focus mode

  const totalMin = blocks.reduce((s, b) => s + b.minutes, 0);
  const doneMin = blocks.filter((b) => b.completed).reduce((s, b) => s + b.minutes, 0);
  const courseCount = new Set(blocks.map((b) => b.course.id)).size;
  const remainingMin = Math.max(0, totalMin - doneMin);

  // Realistic focus time left today: minutes until a 22:00 wind-down (Europe/
  // Berlin), discounted by a focus factor — nobody studies every waking minute.
  const nowParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
  const [hh, mm] = nowParts.split(":").map(Number);
  const minutesNow = hh * 60 + mm;
  const CUTOFF = 22 * 60; // 22:00
  const FOCUS_RATIO = 0.6; // ~60% of remaining hours is realistically focused study
  const availableMin = Math.max(0, Math.round((CUTOFF - minutesNow) * FOCUS_RATIO));
  const achievable = remainingMin === 0 || remainingMin <= availableMin;
  const overBy = Math.max(0, remainingMin - availableMin);

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
    <PullToRefresh>
    {/* First-run intro for brand-new users with no plan yet. It self-gates on a
        localStorage "seen" flag, so it shows at most once and never for users
        who already have courses. */}
    <Onboarding active={hasNoPlan} />
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{t("today.title")}</h1>
        <StreakBadge streak={stats.currentStreak} t={t} />
      </div>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        {today}
        {blocks.length > 0
          ? ` · ${t("today.minDone", { done: doneMin, total: totalMin })} · ${t.n("today.courseCount", courseCount)}`
          : ""}
      </p>
      {nextExam && !examWeek && (
        <Link
          href={`/courses/${nextExam.id}`}
          className="mb-6 mt-1 inline-block text-sm text-gray-500 hover:underline dark:text-gray-400"
        >
          ⏳ {t("today.nextExam")} <span className="font-medium text-gray-700 dark:text-gray-200">{nextExam.name}</span>{" "}
          — {examCountdownLabel(t, nextExamDays!)}
        </Link>
      )}
      {nextExam && examWeek && (
        <Link
          href={`/courses/${nextExam.id}`}
          className="mb-6 mt-2 block rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800 transition-colors hover:border-red-400 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          <span className="font-semibold">{t("today.focusModeExamWeek")}</span>{" "}
          <span className="font-medium">{nextExam.name}</span> {examCountdownLabel(t, nextExamDays!)}.{" "}
          {t("today.focusModeTail")}
        </Link>
      )}
      {!nextExam && <div className="mb-6" />}

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

      {todaysLectures.length > 0 && (
        <section className="mb-4">
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

      <PomodoroTimer blocks={blocks} />

      {upcomingDeadlines.length > 0 && (
        <section className="mb-4">
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

      {blocks.length > 0 && remainingMin > 0 && (
        <div
          aria-live="polite"
          className={`mb-4 rounded-xl border p-4 text-sm ${
            achievable
              ? "border-green-300 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300"
              : "border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
          }`}
        >
          <p className="font-semibold">
            {achievable ? t("today.goalAchievable") : t("today.goalAtRisk")}
          </p>
          <p className="mt-1">
            {t("today.leftStudying", { remaining: fmtDuration(remainingMin) })} ·{" "}
            {t("today.focusTimeTail", { available: fmtDuration(availableMin) })}
          </p>
          {!achievable && (
            <>
              <p className="mt-2">{t("today.overBy", { over: fmtDuration(overBy) })}</p>
              {/* One-tap fix: respread the remaining work across the days left
                  (same global rebuild the recovery banner uses). */}
              <form action={recoverPlan} className="mt-3">
                <SubmitButton variant="primary" pendingLabel={t("today.recoveryPending")}>
                  {t("today.replanCta")}
                </SubmitButton>
              </form>
            </>
          )}
        </div>
      )}

      {blocks.length > 0 ? (
        <AnimatedList className="space-y-2">
          {blocks.map((b) => (
            <AnimatedListItem key={b.id}>
              <TodayBlockRow b={b} />
            </AnimatedListItem>
          ))}
        </AnimatedList>
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
    </PullToRefresh>
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
